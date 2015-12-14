var React = require('react');
var ReactDOM = require('react-dom');
var md5 = require ('md5');
var GRAVATAR_URL = "http://gravatar.com/avatar/";

var UserGrav = React.createClass({

   propTypes: {
    url: React.PropTypes.string.isRequired
  },

  componentDidMount: function() {
    this.loadUsersFromServer();
  },

  loadUsersFromServer: function() {

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
      var userData = this.state.data.map(function(user){ 
        if(user.email) {
          var email = user.email;
          var hash = md5(email);
          var url = GRAVATAR_URL + hash + "?s=" + 50;
        };

        return ( 
          <div>
          <div><img src={url}/></div>
            <p>{user.email}</p>
          </div>
        );  
      });  

      return (  
        <div>
          {userData}
        </div>
      );  
 
    }
});

module.exports = UserGrav;

  
      
 
