var React = require('react');
var ReactDOM = require('react-dom');
var Codemirror = require('./Codemirror');
var Exercises = require('./exercises');
var UserGrav = require('./userGrav');

require('codemirror/addon/lint/lint.js');
require('codemirror/addon/lint/javascript-lint.js');
require('codemirror/lib/codemirror.js');
require('codemirror/mode/javascript/javascript.js');
require('codemirror/mode/css/css.js');

var defaults = {
  javascript: 'var booger = (2+2);',
};

var App = React.createClass({

  propTypes: {
    url: React.PropTypes.string.isRequired
  },

  getInitialState() {
    return {
      code: defaults.javascript,
      readOnly: false,
      mode: 'javascript',
      data: [],
      lint: true
    };
  },

  getNextQuestion() {

  },

  getPrevQuestion() {

  },

  handleSubmit() {

  },

  sendCodeToServer(code) {

    var answer = {answer: code};

    var id = '566756355203c87e2cf01502';

    $.ajax({
      url: '/api/answer/' + id,
      dataType: 'json',
      cache: false,
      data: answer,
      type: 'POST',
      success: function(data) {
        alert('Your answer is ');
      },
      error: function(xhr, status, err) {
        console.log('broken url is ');
        console.error(status, err.toString());
      }
    });
  },

  updateCode(newCode) {
    this.setState({
      code: newCode
    });
  },
  changeMode(e) {
    var mode = e.target.value;
    this.setState({
      mode: mode,
      code: defaults[mode]
    });
  },
  toggleReadOnly() {
    this.setState({
      readOnly: !this.state.readOnly
    }, () => this.refs.editor.focus());
  },
  render() {
    var self = this;
    var options = {
      lineNumbers: true,
      mode: 'javascript',
      theme: 'midnight',
      gutters: ['CodeMirror-lint-markers'],
      lint: true,
    };
    return (
      <div>
        <div className="container">
          <div className="col-md-8">
            <Codemirror ref="studentAnswer" type = "text" value={this.state.code} onChange={this.updateCode} options={options} />
          </div>
        </div>
          <button onClick={this.sendCodeToServer.bind(this, this.state.code)} type="submit" className="btn btn-default" id="handleSubmit"> Submit </button>
          <button type="button" id="hint-button" className="btn btn-danger" data-toggle="popover" title="Hint" data-content="Heres a hint: ">Hint</button>
      </div>
    );
  }
});

ReactDOM.render(<App url="/api/exercises/"/>, document.getElementById('my-app'));
ReactDOM.render(<UserGrav url="/api/users/"/>, document.getElementById('local-image'));
