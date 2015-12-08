var React = require('react');
var ReactDOM = require('react-dom');
var UserExerciseData = require('./userExerciseData.js');

var UserProfile = React.createClass({

  // propTypes: {
  //   data: React.PropTypes.array.isRequired
  // },

    render:function(){
      return (
        <div>
          <h1>Hello</h1>
          <UserExerciseData/>
        </div>
        );
    }
});

ReactDOM.render(<UserProfile/>, document.getElementById('profile-comp'));