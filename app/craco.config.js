module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        fs: false,
        stream: require.resolve("stream-browserify"),
        path: require.resolve("path-browserify"),
      };
      webpackConfig.module.rules.push({
        test: /\.wasm$/,
        type: "asset/inline",
        generator: {
          dataUrl: (content) => content.toString("base64"),
        },
      });
      webpackConfig.ignoreWarnings = [
        {
          module: /node_modules\/@coral-xyz/,
          message: /Failed to parse source map/,
        },
        {
          module: /node_modules\/@solana/,
          message: /Failed to parse source map/,
        },
        {
          module: /node_modules\/superstruct/,
          message: /Failed to parse source map/,
        },
      ];

      return webpackConfig;
    },
  },
};
