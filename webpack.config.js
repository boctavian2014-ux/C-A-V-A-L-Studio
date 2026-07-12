const path = require("path");
const webpack = require("webpack");
const MonacoWebpackPlugin = require("monaco-editor-webpack-plugin");

const shared = {
  mode: process.env.NODE_ENV === "production" ? "production" : "development",
  devtool: "source-map",
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
        use: "ts-loader",
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
        "monaco-editor": path.resolve(
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
        languages: ["typescript", "javascript", "json", "css", "html", "markdown", "python", "shell"],
        publicPath: "renderer/",
      }),
      // TypeScript compiler is main-process only — bundling it in renderer causes OOM / black screen.
      new webpack.IgnorePlugin({
        resourceRegExp: /^typescript$/,
      }),
    ],
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
