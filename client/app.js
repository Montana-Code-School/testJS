var React = require('react');
var ReactDOM = require('react-dom');
var Codemirror = require('./Codemirror');
var Exercises = require('./exercises');

require('codemirror/addon/lint/lint.js');
require('codemirror/addon/lint/css-lint.js');
require('codemirror/mode/javascript/javascript');
require('codemirror/mode/xml/xml');
require('codemirror/mode/markdown/markdown');

var defaults = {
  markdown: '# Trevor rules',
  javascript: 'Write Code Here'
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
      data: []
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
      readOnly: this.state.readOnly,
      mode: this.state.mode,
      lint: true,
      theme: 'midnight'
    };
    return (
     <div>
       <div className="container">
         <div style={{ marginTop: 10, marginBottom: 10 }}>
           <select onChange={this.changeMode} value={this.state.mode}>
             <option value="javascript">JavaScript</option>
             <option value="markdown">Markdown</option>
           </select>
           <button onClick={this.toggleReadOnly}>Toggle read-only mode (currently {this.state.readOnly ? 'on' : 'off'})</button>
         </div>
         <div className="col-md-12">
           <Codemirror className="col-md-8" ref="studentAnswer" type = "text" value={this.state.code} onChange={this.updateCode} options={options} />
         </div>
      </div>
       <button onClick={this.sendCodeToServer.bind(this, this.state.code)} type="submit" className="btn btn-default" id='handleSubmit'> Submit </button>
       </div>
   );
  }
});

ReactDOM.render(<App url="/api/exercises/"/>, document.getElementById('my-app'));
