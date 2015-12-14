var React = require('react');
var ReactDOM = require('react-dom');
var UserExerciseData = require('./userExerciseData.js');

var UserProfile = React.createClass({
  propTypes: {
    url: React.PropTypes.string.isRequired
  },

  getInitialState: function() {
    return {data: []};
  },

  componentDidMount: function() {
    this.loadAnswersFromServer();
  },

  loadAnswersFromServer: function() {

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
        <UserExerciseData url={this.props.url} data={this.state.data}/>
      </div>
      );
  }
});

ReactDOM.render(<UserProfile url="/api/answer/"/>, document.getElementById('profile-comp'));
