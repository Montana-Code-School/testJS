var React = require('react');
var ReactDOM = require('react-dom');
var Exercises = require('./exercises')

var ExerciseList = React.createClass({

  propTypes: {
    data: React.PropTypes.array.isRequired
  },


  render: function() {
  
    return (
      <div>
        <h1>HELLO WORLD</h1>
      </div>
    );
  }
});

module.exports = ExerciseList;


// <div>
//           <div key={currEx._id} className="well exerciseBox">
//             <div className="exerciseName"><h1>{currEx.answer}</h1></div>
//             <div><h3> Solve this Problem: {currEx.problem}</h3></div>
//           </div>
//         </div>
//       ); 
// var React = require('react');
// var ReactDOM = require('react-dom');
// var Exercises = require('./exercises');

// var ExerciseList = React.createClass({

//   // propTypes: {
//   //   url: React.PropTypes.string.isRequired,
//   //   data: React.PropTypes.array.isRequired
//   // },


//   render: function() {
//     var answerData = this.props.data.map(function(answer){
//       return (
//         <div>
//           <div  key={answer._id} className="well exerciseBox">
//             <div className="exerciseName"><h1>{answer.answer}</h1></div>
//             <div><h3> Solve this Problem: {answer.date}</h3></div>
//           </div>
//         </div>
//       ); 
//     });

//     return (
//       <div>
//         {answerData}
//       </div>
//     );
//   }
// });

// module.exports = ExerciseList;
