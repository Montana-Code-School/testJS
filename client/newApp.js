var React = require('react');
var ReactDOM = require('react-dom');
var Codemirror = require('react-codemirror');
    require('codemirror/mode/javascript/javascript');
    require('codemirror/mode/xml/xml');
    require('codemirror/mode/markdown/markdown');

var App = React.createClass({
    getInitialState: function() {
        return {
            code: "// Code"
        };
    },
    updateCode: function(newCode) {
        this.setState({
            code: newCode
        });
    },
    render: function() {
        var options = {
            lineNumbers: true
        };
        return  (
         <div className="container">
          <Codemirror value={this.state.code} onChange={this.updateCode} options={{mode: 'javascript'}} />
        </div>

        )
    }
});

ReactDOM.render(<App />, document.getElementById('my-app'));