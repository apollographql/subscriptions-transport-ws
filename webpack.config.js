module.exports = {
  context: __dirname + "/src",
  entry: './index.ts',
  output: {
    path: __dirname + '/browser',
    filename: 'bundle.js',
    library: 'apolloSubscriptions',
    libraryTarget: 'umd'
  },
  resolve: {
    extensions: ['', '.webpack.js', '.web.js', '.ts', '.js']
  },
  module: {
    loaders: [
      { test: /\.ts$/, loader: 'ts-loader' },
      { test: /\.json$/, loader: 'json-loader' }
    ]
  }
}
