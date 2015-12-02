import React from 'react';
var App = React.createClass({
  render () {
    return (
      <div className="jumbotron">
          <ul>
            <h1 id="home-title">  TestJS </h1>
          </ul>
      </div>
    );
  }
});

ReactDOM.render(<App/>, document.getElementById('first-container'));
