import path from 'path'
import babel from 'rollup-plugin-babel'
import notify from 'rollup-plugin-notify'
import pkg from './package.json'
import {builtinModules} from 'module'
import {terser} from 'rollup-plugin-terser'
import * as polyfills from './src/util/iePolyfill.js'
import {fileURLToPath} from 'url'


function replaceBuiltinsWithIePolyfills() {
	// list of things that needs to be translated
	var translatables = [
		['Object.keys',        'ObjectKeys'],
		['Object.values',      'ObjectValues'],
		['Object.entries',     'ObjectEntries'],
		['Object.assign',      'ObjectAssign'],
		['Object.fromEntries', 'ObjectFromEntries'],
		['Array.from',         'ArrayFrom'],
		['new Set',            'NewSet'],
		['new Map',            'NewMap'],
		['Number.isNaN',       'isNaN'],
	]
	// keys of translatables and builtings (like fetch)
	let polyfillKeys = Object.keys(polyfills)
	let exifrDir = path.dirname(fileURLToPath(import.meta.url))
	let polyFilePath = path.join(exifrDir, './src/util/iePolyfill.js')
    console.log('polyFilePath', polyFilePath)
	function createImportLine(keys, importPath) {
		return `import {${keys.join(', ')}} from '${importPath}'\n`
	}
	function createRelativeImportPath(filePath) {
		let importPath = path
			.relative(path.dirname(filePath), polyFilePath)
			.replace(/\\/g, '/')
		if (!importPath.startsWith('.')) importPath = './' + importPath
		return importPath
	}
	return {
		async transform(code, filePath) {
			if (!filePath.includes('exifr')) return null
			if (filePath.endsWith('iePolyfill.js')) return null
			for (let [from, to] of translatables)
				code = code.replace(new RegExp(from, 'g'), to)
			let importPath = createRelativeImportPath(filePath)
            console.log('filePath  ', filePath)
            console.log('importPath', importPath)
			let importLine = createImportLine(polyfillKeys, importPath)
			code = importLine + '\n' + code
			return code
		}
	}
}

function replaceFile(fileName, replacement = 'export default {}') {
	const targetId = 'replace-' + Math.round(Math.random() * 10000)
	return {
		resolveId(importPath) {
			return importPath.endsWith(fileName) ? targetId : null
		},
		load(importPath) {
			return importPath === targetId ? replacement : null
		},
	}
}

// IE10 doesn't copy static methods to inherited classes. Babel know about it for years
// but they are stubborn to do anything about it. So we inject the method copying to their _inherits().
function fixIeStaticMethodSubclassing() {
	let searched = 'if (superClass) _setPrototypeOf'
	let injection = `
	var builtins = ['prototype', '__proto__', 'caller', 'arguments', 'length', 'name']
	Object.getOwnPropertyNames(superClass).forEach(function(key) {
		if (builtins.indexOf(key) !== -1) return
		if (subClass[key] !== superClass[key]) subClass[key] = superClass[key]
	})`
	let replacement = injection + '\n' + searched
	return {
		renderChunk(code) {
			return code.replace(searched, replacement)
		}
	}
}

// Webpack magic comment to ignore import('fs')
function injectIgnoreComments() {
	return {
		renderChunk(code) {
			return code.replace(`import(`, `import(/* webpackIgnore: true */ `)
		}
	}
}

const terserConfig = {
	compress: true,
	mangle: true,
	toplevel: true
}

const babelPlugins = [
	//'@babel/plugin-proposal-nullish-coalescing-operator',
	//'@babel/plugin-proposal-optional-chaining',
	'@babel/plugin-proposal-class-properties',
]

const babelModern = {
	plugins: babelPlugins,
	presets: [
		['@babel/preset-env', {
			targets: '>1%, not dead, not ie 10-11'
		}],
		
	],
	"comments": false
}

const babelLegacy = {
	plugins: [
		...babelPlugins,
		//'./src/util/babel-plugin-transform-for-of-array-to-array.cjs',
		'babel-plugin-transform-for-of-without-iterator',
		'babel-plugin-transform-async-to-promises',
		// select es2015 preset builtins
		'@babel/plugin-transform-arrow-functions',
		'@babel/plugin-transform-block-scoping',
		'@babel/plugin-transform-classes',
		'@babel/plugin-transform-computed-properties',
		['@babel/plugin-transform-destructuring', {loose: true, useBuiltIns: true}],
		'@babel/plugin-transform-duplicate-keys',
		'@babel/plugin-transform-function-name',
		'@babel/plugin-transform-literals',
		'@babel/plugin-transform-parameters',
		'@babel/plugin-transform-shorthand-properties',
		['@babel/plugin-transform-spread', {loose: true}],
		'@babel/plugin-transform-template-literals',

	],
}

var external = [...builtinModules, ...Object.keys(pkg.dependencies || {})]
var globals = objectFromArray(external)

var name = pkg.name
var amd = {id: pkg.name}

function createLegacyBundle(inputPath, outputPath) {
	return {
		input: inputPath,
		plugins: [
			notify(),
			replaceFile('FsReader.js'),
			babel(babelLegacy),
			replaceBuiltinsWithIePolyfills(),
			fixIeStaticMethodSubclassing(),
			terser(terserConfig),
		],
		external,
		output: {
			file: outputPath,
			format: 'umd',
			name,
			amd,
			globals,
		},
	}
}

function createModernBundle(inputPath, esmPath, umdPath) {
	return {
		input: inputPath,
		plugins: [
			notify(),
			babel(babelModern),
			terser(terserConfig),
			injectIgnoreComments()
		],
		external,
		output: [{
			file: umdPath,
			format: 'umd',
			name,
			amd,
			globals,
		}, {
			file: esmPath,
			format: 'esm',
			globals,
		}],
	}
}

export default [
	/*
	createModernBundle('src/bundle-full.js','dist/full.esm.js', 'dist/full.umd.js'),
	createModernBundle('src/bundle-lite.js','dist/lite.esm.js', 'dist/lite.umd.js'),
	createModernBundle('src/bundle-mini.js','dist/mini.esm.js', 'dist/mini.umd.js'),
	createModernBundle('src/bundle-core.js','dist/core.esm.js', 'dist/core.umd.js'),
	createLegacyBundle('src/bundle-full.js', 'dist/full.legacy.umd.js'),
	createLegacyBundle('src/bundle-lite.js', 'dist/lite.legacy.umd.js'),
	*/
	createLegacyBundle('src/bundle-mini.js', 'dist/mini.legacy.umd.js'),
]

function objectFromArray(modules) {
	var obj = {}
	modules.forEach(moduleName => obj[moduleName] = moduleName)
	return obj
}