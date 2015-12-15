var React = require('react');
var ReactDOM = require('react-dom');

var ExerciseList = React.createClass({

  propTypes: {
    url: React.PropTypes.string.isRequired,
    data: React.PropTypes.array.isRequired
  },


  render: function() {
    var exerciseData = this.props.data.map(function(exercise){
      console.log('how are you')
      if(exercise.userAnswer) {
        console.log("hello");
        var userAnswerData = exercise.userAnswer.map(function(userAnswer){ 
          console.log('we are in exerciseData')
          if(userAnswer.pass === false){
            console.log('got em coach')
            return(
              <div>
                {userAnswer.pass}
              </div>
            );
          }
        })
      }
      if(userAnswerData === true){
      return (
        <div>
          {userAnswerData}
          <div  key={exercise._id} className="well exerciseBox">
            <div className="exerciseName"><h1>{exercise.name}</h1></div>
            <div><h3> Solve this Problem: {exercise.problem}</h3></div>
          </div>
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
