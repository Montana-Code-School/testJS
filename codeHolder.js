var React = require('react');
var ReactDOM = require('react-dom');
var Exercises = require('./exercises')

var ExerciseList = React.createClass({

  propTypes: {
    data: React.PropTypes.array.isRequired
  },

  render: function() {
    console.log(this.props.data);
    var exercises = this.props.data.map(function(exercise){
      console.log(exercise.prev);
      return exercise.prev === null;
    })
    return(
      <div>
        {exercises[0].problem}
      </div>
      );
  }
});

module.exports = ExerciseList;




