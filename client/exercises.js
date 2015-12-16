var React = require('react');
var ReactDOM = require('react-dom');
var ExerciseList = require('./ExerciseList');


var Exercises = React.createClass({

  propTypes: {
    data: React.PropTypes.object
  },

  render: function() {
    return (
      <div>
        <ExerciseList data={this.props.data}/>
      </div>
    );
  }
});

module.exports = Exercises;
