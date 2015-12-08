var React = require('react');
var ReactDOM = require('react-dom');
var UserProfile = require('./userProfile');

var UserExerciseData = React.createClass({

  propTypes: {
    data: React.PropTypes.array.isRequired
  },

    render: function() {
          var exercise = this.props.data.map(function(c) {
            var result = c.pass === true ? 'pass': 'fail';
            return (
               <div key={c.id} className='well'>
                 <table className='table'>
                   <tr>{c.exercise}</tr>
                     <td>{c.answer}</td>
                     <td>Result: {result}</td>
                 </table>
               </div>
            );
          })

          return (
            <div>
              {exercise}
            </div>
          );
        }
    });

module.exports = UserExerciseData;

