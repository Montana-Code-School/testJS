var React = require('react');
var ReactDOM = require('react-dom');

var ExerciseList = React.createClass({

  propTypes: {
    url: React.PropTypes.string.isRequired,
    data: React.PropTypes.array.isRequired
  },

  render: function() {

    var exerciseData = this.props.data.map(function(exercise) {
      return (
        <div key={exercise._id} className="well">
          <div><h1>{exercise.name}</h1></div>
          <div><h3> Solve this Problem: {exercise.problem}</h3></div>
        </div>
      );
    });

    return (
      <div>
        {exerciseData}
      </div>
    );
  }
});

module.exports = ExerciseList;

// var indexPlusOne = 0;
//     var exerciseDataLoop = this.props.data.map(function(exercise) {
//         for(var i=0; i <= exercise.length; i++) {
//           if(code === pass onClick) {
//             go to the next exercise id
//           }
//           console.log(indexPlusOne)
//           indexPlusOne++;
//         }
//     });
