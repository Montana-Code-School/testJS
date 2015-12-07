var React = require('react');
var ReactDOM = require('react-dom');

var ExerciseList = React.createClass({

  propTypes: {
    url: React.PropTypes.string.isRequired,
    data: React.PropTypes.array.isRequired
  },

  render: function() {
    var exerciseData = this.props.data.map(function(exercise) {
      if (exercise._id === '56647b9638b55b1f05f24fbd') {
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