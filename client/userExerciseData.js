var React = require('react');
var ReactDOM = require('react-dom');
var UserProfile = require('./userProfile');

var UserExerciseData = React.createClass({

  propTypes: {
    data: React.PropTypes.array.isRequired
  },

  render: function() {
    var exercise = this.props.data.map(function(c) {
      return (
        <div>
          <h1>World</h1>
          <p>{c.answer}</p>
        </div>
      );
    });
    return (
      <div>
        {exercise}
      </div>
    );
  }
});

module.exports = UserExerciseData;
