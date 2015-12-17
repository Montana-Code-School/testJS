var React = require('react');
var ReactDOM = require('react-dom');
var Exercises = require('./exercises')

var ExerciseList = React.createClass({

  propTypes: {
    data: React.PropTypes.object
  },

  render: function() {
    return(
      <div className="">
        <div className="well">
          <h1>{this.props.data ? this.props.data.name : ''}</h1>
          <h4>{this.props.data ? this.props.data.problem : ''}</h4>
        </div>
      </div>
      );
    }
  });

module.exports = ExerciseList;
