import postcssPresetEnv from 'postcss-preset-env';

const browsers = ['chrome >= 61', 'android >= 61', 'safari >= 12', 'firefox >= 60'];

/**
 * Tailwind gives its CSS variables default values with @property, and only adds a fallback for
 * old Safari/Firefox. Old Chrome (e.g. on smart TVs) gets neither, so borders and shadows break.
 * Unwrap that fallback so every browser gets the defaults. They sit in the lowest-priority layer,
 * so they never override real styles.
 */
const propertyFallbackForAll = {
  postcssPlugin: 'tailwind-property-fallback-for-all',
  AtRule: {
    supports(rule) {
      if (rule.params.includes('-webkit-hyphens:none') || rule.params.includes('-webkit-hyphens: none')) {
        rule.replaceWith(rule.nodes);
      }
    },
  },
};

// Runs after Tailwind: rewrites modern CSS (cascade layers, oklch colors, color-mix, nesting)
// into forms older browsers understand, so the app is styled on old TV / phone browsers too.
export default {
  plugins: [
    propertyFallbackForAll,
    postcssPresetEnv({
      browsers,
      stage: 2,
      features: {
        'cascade-layers': true,
        'oklab-function': { preserve: true },
        'color-mix': { preserve: true },
        'nesting-rules': true,
      },
    }),
  ],
};
