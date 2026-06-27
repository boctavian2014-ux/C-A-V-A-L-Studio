const path = require("path");
const webpack = require("webpack");

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
    plugins: [
      new webpack.ProvidePlugin({
        global: "globalThis",
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
