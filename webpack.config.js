const path = require("path");
const webpack = require("webpack");
const MonacoWebpackPlugin = require("monaco-editor-webpack-plugin");

const isProduction = process.env.NODE_ENV === "production";

const shared = {
  mode: isProduction ? "production" : "development",
  // Source maps only in development — shipping them in Electron prod exposes main-process TS.
  devtool: isProduction ? false : "source-map",
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".json"],
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"]
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "ts-loader",
          options: {
            compilerOptions: {
              noEmit: false,
            },
          },
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"]
      },
      {
        test: /\.(png|jpe?g|gif|webp|svg)$/i,
        type: "asset/resource",
        generator: {
          filename: "renderer/assets/[name][hash][ext]"
        }
      }
    ]
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    // clean:false is intentional: three configs share the same dist/; CI should wipe dist for a fresh build.
    clean: false
  }
};

module.exports = [
  {
    ...shared,
    name: "main",
    target: "electron-main",
    externals: {
      "node-pty": "commonjs2 node-pty"
    },
    entry: {
      "main/electron-main": "./src/main/electron-main.ts",
      "main/preload": "./src/main/preload.ts",
      "main/preload-worker": "./ai/preload/preload-worker.ts",
      "main/context-parallel-worker": "./ai/context/parallel/parallel-worker.ts"
    }
  },
  {
    ...shared,
    name: "renderer",
    target: "electron-renderer",
    resolve: {
      ...shared.resolve,
      alias: {
        // Exact match only — allow `monaco-editor/esm/...` language contributions.
        "monaco-editor$": path.resolve(
          __dirname,
          "node_modules/monaco-editor/esm/vs/editor/editor.api.js"
        ),
      },
    },
    module: {
      ...shared.module,
      rules: [
        ...shared.module.rules,
        {
          test: /\.ttf$/,
          type: "asset/resource",
          generator: {
            filename: "renderer/assets/[name][ext][query]",
          },
        },
      ],
    },
    plugins: [
      new webpack.ProvidePlugin({
        global: "globalThis",
      }),
      new MonacoWebpackPlugin({
        languages: ["typescript", "javascript", "json", "css", "html", "markdown", "python"],
        // Keep gotoSymbol + referenceSearch — used by editor commands (quickOutline / goToReferences).
        features: [
          "!rename",
          "!inspectTokens",
          "!documentSymbols",
          "!codelens",
          "!colorPicker",
          "!folding",
        ],
        publicPath: "renderer/",
      }),
      // TypeScript compiler is main-process only — bundling it in renderer causes OOM / black screen.
      new webpack.IgnorePlugin({
        resourceRegExp: /^typescript$/,
      }),
    ],
    optimization: {
      splitChunks: {
        chunks: "all",
        maxInitialRequests: 10,
        cacheGroups: {
          // Only Monaco — disable default vendor splitting (avoids many startup requests).
          default: false,
          defaultVendors: false,
          monaco: {
            test: /[\\/]node_modules[\\/]monaco-editor[\\/]/,
            name: "renderer/monaco",
            priority: 20,
            reuseExistingChunk: true,
          },
        },
      },
    },
    entry: {
      "renderer/workbench-app": "./src/renderer/workbench-app.tsx"
    }
  },
  {
    ...shared,
    name: "node-services",
    target: "node20",
    entry: {
      "services/caval-runtime": "./src/caval-runtime.ts"
    }
  }
];
