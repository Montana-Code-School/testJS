var React = require('react');
var App = React.createClass({
  render: function() {
    return (
      <div className="jumbotron">
          <ul>
            <h1 id="home-title">  TestJS </h1>
          </ul>
      </div>
    );
  }
});

React.render(<App/>, document.getElementById('first-container'));
