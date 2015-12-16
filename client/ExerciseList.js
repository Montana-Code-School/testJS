var React = require('react');
var ReactDOM = require('react-dom');
var Exercises = require('./exercises')

var ExerciseList = React.createClass({

  propTypes: {
    data: React.PropTypes.object
  },

  render: function() {
    return(
      <div>
        {this.props.data ? this.props.data.problem : ''}
      </div>
      );
    }
  });

module.exports = ExerciseList;
