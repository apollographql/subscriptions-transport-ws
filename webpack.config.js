var path = require('path');

module.exports = {
  context: path.join(__dirname, '/src'),
  entry: './client.ts',
  output: {
    path: path.join(__dirname, '/browser'),
    filename: 'bundle.js',
    library: 'SubscriptionsTransportWs'
  },
  resolve: {
    extensions: ['', '.json', '.ts', '.js']
  },
  module: {
    loaders: [
      { test: /\.ts$/, loader: 'ts-loader' },
      { test: /\.json$/, loader: 'json-loader' }
    ]
  }
}
