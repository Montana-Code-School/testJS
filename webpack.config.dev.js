var path = require('path');
var webpack = require('webpack');

module.exports = {
  devtool: 'eval',
  entry: {
    index: ['webpack-hot-middleware/client',
    './client/app'],
    postExerciseBox: ['webpack-hot-middleware/client',
    './client/postExerciseBox'],
    userProfile: ['webpack-hot-middleware/client',
      './client/userProfile'],
    crudBox: ['webpack-hot-middleware/client',
    './client/crudBox'],
  },
  output: {
    path: path.join(__dirname, 'static'),
    filename: '[name].js',
    publicPath: '/static/',
    plugins: [ new webpack.optimize.CommonsChunkPlugin('init.js') ]
  },
  plugins: [
    new webpack.HotModuleReplacementPlugin(),
    new webpack.NoErrorsPlugin()
  ],
  module: {
    loaders: [
      {
        test: /\.js$/,
        loader: 'babel',
        include: path.join(__dirname, 'client'),
        query: {
          cacheDirectory: true,
          presets: ['es2015', 'react']
        }
      }
    ]
  }
};
