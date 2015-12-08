var React = require('react');
var ReactDOM = require('react-dom');
var UserExerciseData = require('./userExerciseData.js');

var UserProfile = React.createClass({

  getInitialState: function() {
    return {data: []};
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

    // loadAnswersFromServer: function(answer) {
    //   console.log('were inside' + data)
    //   $.ajax({
    //     url: this.props.url,
    //     dataType: 'json',
    //     cache: false,
    //     data: data,
    //     success: function(data) {
    //         console.log('posting data!', data, response);
    //         this.setState({data: data});
    //         document.location = '/profile';
    //       },
    //       error: function(xhr, status, err) {
    //         console.log(err);
    //       }.bind(this)
    //   });
    // },

  componentDidMount: function() {
    console.log('mounted')
    this.loadAnswersFromServer();
  },
    render:function(){
      return (
        <div>
          <h1>Hello</h1>
          <UserExerciseData url={this.props.url} data={this.state.data}/>
        </div>
        );
    }
});

ReactDOM.render(<UserProfile url='/api/answer/'/>, document.getElementById('profile-comp'));