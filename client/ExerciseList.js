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
        <div id="exerciseDiv" className="well">
          <h1 id="exerciseName">{this.props.data ? this.props.data.name : ''}</h1>
          <h4 id="exerciseProblem"><strong>Solve this</strong>: {this.props.data ? this.props.data.problem : ''}</h4>
        </div>
      </div>
      );
    }
  });

module.exports = ExerciseList;
