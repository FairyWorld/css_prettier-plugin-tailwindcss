import type { Parser, ParserOptions, Plugin, Printer } from 'prettier'
import './types'
import * as prettierParserAcorn from 'prettier/plugins/acorn'
import * as prettierParserBabel from 'prettier/plugins/babel'
import * as prettierParserFlow from 'prettier/plugins/flow'
import * as prettierParserGlimmer from 'prettier/plugins/glimmer'
import * as prettierParserHTML from 'prettier/plugins/html'
import * as prettierParserMeriyah from 'prettier/plugins/meriyah'
import * as prettierParserPostCSS from 'prettier/plugins/postcss'
import * as prettierParserTypescript from 'prettier/plugins/typescript'
import { loadIfExists, maybeResolve } from './resolve'

interface PluginDetails {
  parsers: Record<string, Parser<any>>
  printers: Record<string, Printer<any>>
}

async function loadIfExistsESM(name: string): Promise<Plugin<any>> {
  let mod = await loadIfExists<Plugin<any>>(name)

  mod ??= {
    parsers: {},
    printers: {},
  }

  return mod
}

export async function loadPlugins() {
  const builtin = await loadBuiltinPlugins()
  const thirdparty = await loadThirdPartyPlugins()
  const compatible = await loadCompatiblePlugins()

  let parsers = {
    ...builtin.parsers,
    ...thirdparty.parsers,
  }

  let printers = {
    ...builtin.printers,
    ...thirdparty.printers,
  }

  function findEnabledPlugin(
    options: ParserOptions<any>,
    name: string,
    mod: any,
  ) {
    let path = maybeResolve(name)

    for (let plugin of options.plugins) {
      if (plugin instanceof URL) {
        if (plugin.protocol !== 'file:') continue
        if (plugin.hostname !== '') continue

        plugin = plugin.pathname
      }

      if (typeof plugin === 'string') {
        if (plugin === name || plugin === path) {
          return mod
        }

        continue
      }

      // options.plugins.*.name == name
      if (plugin.name === name) {
        return mod
      }

      // options.plugins.*.name == path
      if (plugin.name === path) {
        return mod
      }

      // basically options.plugins.* == mod
      // But that can't work because prettier normalizes plugins which destroys top-level object identity
      if (plugin.parsers && mod.parsers && plugin.parsers == mod.parsers) {
        return mod
      }
    }

    return null
  }

  return {
    parsers,
    printers,

    originalParser(format: string, options: ParserOptions) {
      if (!options.plugins) {
        return parsers[format]
      }

      let parser = { ...parsers[format] }

      // Now load parsers from "compatible" plugins if any
      for (const { name, mod } of compatible) {
        let plugin = findEnabledPlugin(options, name, mod)
        if (plugin) {
          Object.assign(parser, plugin.parsers[format])
        }
      }

      return parser
    },
  }
}

async function loadBuiltinPlugins(): Promise<PluginDetails> {
  return {
    parsers: {
      html: prettierParserHTML.parsers.html,
      glimmer: prettierParserGlimmer.parsers.glimmer,
      lwc: prettierParserHTML.parsers.lwc,
      angular: prettierParserHTML.parsers.angular,
      vue: prettierParserHTML.parsers.vue,
      css: prettierParserPostCSS.parsers.css,
      scss: prettierParserPostCSS.parsers.scss,
      less: prettierParserPostCSS.parsers.less,
      babel: prettierParserBabel.parsers.babel,
      'babel-flow': prettierParserBabel.parsers['babel-flow'],
      flow: prettierParserFlow.parsers.flow,
      typescript: prettierParserTypescript.parsers.typescript,
      'babel-ts': prettierParserBabel.parsers['babel-ts'],
      acorn: prettierParserAcorn.parsers.acorn,
      meriyah: prettierParserMeriyah.parsers.meriyah,
      __js_expression: prettierParserBabel.parsers.__js_expression,
    },
    printers: {
      //
    },
  }
}

async function loadThirdPartyPlugins(): Promise<PluginDetails> {
  let [astro, liquid, marko, twig, hermes, oxc, pug, svelte] =
    await Promise.all([
      loadIfExistsESM('prettier-plugin-astro'),
      loadIfExistsESM('@shopify/prettier-plugin-liquid'),
      loadIfExistsESM('prettier-plugin-marko'),
      loadIfExistsESM('@zackad/prettier-plugin-twig'),
      loadIfExistsESM('@prettier/plugin-hermes'),
      loadIfExistsESM('@prettier/plugin-oxc'),
      loadIfExistsESM('@prettier/plugin-pug'),
      loadIfExistsESM('prettier-plugin-svelte'),
    ])

  return {
    parsers: {
      ...astro.parsers,
      ...liquid.parsers,
      ...marko.parsers,
      ...twig.parsers,
      ...hermes.parsers,
      ...oxc.parsers,
      ...pug.parsers,
      ...svelte.parsers,
    },
    printers: {
      ...hermes.printers,
      ...oxc.printers,
      ...svelte.printers,
    },
  }
}

async function loadCompatiblePlugins() {
  // Plugins are loaded in a specific order for proper interoperability
  let plugins = [
    'prettier-plugin-css-order',
    'prettier-plugin-organize-attributes',
    'prettier-plugin-style-order',

    // The following plugins must come *before* the jsdoc plugin for it to
    // function correctly. Additionally `multiline-arrays` usually needs to be
    // placed before import sorting plugins.
    //
    // https://github.com/electrovir/prettier-plugin-multiline-arrays#compatibility
    'prettier-plugin-multiline-arrays',
    '@ianvs/prettier-plugin-sort-imports',
    '@trivago/prettier-plugin-sort-imports',
    'prettier-plugin-organize-imports',
    'prettier-plugin-sort-imports',

    'prettier-plugin-jsdoc',
  ]

  // Load all the available compatible plugins up front
  // These are wrapped in try/catch internally so failure doesn't cause issues
  // Technically we're executing these plugins though
  // Even if not enabled
  // There is, unfortunately, no way around this currently
  return await Promise.all(
    plugins.map(async (name) => {
      let mod = await loadIfExistsESM(name)

      return {
        name,
        mod,
      }
    }),
  )
}
