var React = require('react');
var ReactDOM = require('react-dom');

var ExerciseList = React.createClass({

  propTypes: {
    url: React.PropTypes.string.isRequired,
    data: React.PropTypes.array.isRequired
  },

  render: function() {
    var exerciseData = this.props.data.map(function(exercise) {
      if (exercise._id === '5661d0b2c8fdd09b12094aad') {
        return (
          <div key={exercise._id} className="well">
            <div><h1>{exercise.name}</h1></div>
            <div><h3> Solve this Problem: {exercise.problem}</h3></div>
          </div>
        );
      }
    });
    return (
      <div>
        {exerciseData}
      </div>
      );
  }
});

module.exports = ExerciseList;
