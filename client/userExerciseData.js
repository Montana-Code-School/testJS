var React = require('react');
var ReactDOM = require('react-dom');
var UserProfile = require('./userProfile');

var UserExerciseData = React.createClass({

  propTypes: {
    data: React.PropTypes.array.isRequired
  },

  render: function() {
    var exercise = this.props.data.map(function(c) {
      var result = c.pass === true ? 'pass' : 'fail';
        if(result === 'pass'){
          return (
            <div key={c._id} className="well">
            <table className="table table-bordered">
              <thead>
                <tr>
                  <th>Exercise</th>
                    <th>Answer</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{c.exercise.problem}</td>
                    <td>{c.answer}</td>
                    <td>{result}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        }
    });
    return (
      <div>
        {exercise}
      </div>
    );
  }
});

module.exports = UserExerciseData;
