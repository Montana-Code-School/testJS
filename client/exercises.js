var React = require('react');
var ReactDOM = require('react-dom');
var ExerciseList = require('./ExerciseList');

var Exercises = React.createClass({

  propTypes: {
    url: React.PropTypes.string.isRequired
  },

  getInitialState: function() {
    return {data: []};
  },

  componentDidMount: function() {
    this.loadExercises();
  },

  loadExercises: function(exercise) {

    $.ajax({
      url: this.props.url,
      dataType: 'json',
      cache: false,
      success: function(data) {
        console.log('inside success');
        this.setState({data: data});
      }.bind(this),
      error: function(xhr, status, err) {
        console.log('Broken url is ' + this.props.url);
        console.error(this.props.url, status, err.toString());
      }.bind(this)
    });
  },

  render: function() {
    return (
          <div>
          <ExerciseList url={this.props.url} data={this.state.data}/>
          </div>
          );
  }
});
ReactDOM.render(<Exercises url="/api/exercises/"/>, document.getElementById('exerciseBox'));
//  module.exports = Exercises;
