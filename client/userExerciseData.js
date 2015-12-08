var React = require('react');
var ReactDOM = require('react-dom');

var UserExerciseData = React.createClass({

  getInitialState: function() {
    return {data: []};
  },

  componentDidMount: function() {
    this.loadAnswersFromServer();
  },
    loadAnswersFromServer () {
      $.ajax({
        url: 'api/answers',
        dataType: 'json',
        data: data,
        type: 'GET',
        success: function(response) {
            console.log('posting data!', data, response);
            document.location = '/profile';
          },
          error: function(xhr, status, err) {
            console.log(err);
          }.bind(this)
      });
    },

    render:function() {
      var exercise = this.state.data.map(function(c) {
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
