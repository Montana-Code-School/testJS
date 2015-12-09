var React = require('react');
var ReactDOM = require('react-dom');
var crudBox = require('./crudBox.js');

var CrudList = React.createClass({

  handleUpdate: function(id) {

   var problem = this.refs.problem.value.trim();
   var answer = ReactDOM.findDOMNode(this.refs.answer).value.trim();
   var type = ReactDOM.findDOMNode(this.refs.type).value.trim();
   var name = ReactDOM.findDOMNode(this.refs.name).value.trim();

   if (!problem) {
     return;
   }
   var data = ({problem: problem, answer: answer, name: name, type: type});
   console.log(data);
   $.ajax({
     url: '/api/exercises/' + id,
     dataType: 'json',
     data: data,
     type: 'PUT',
     success: function(poop) {
       console.log('Updating Exercise!', data, poop);
       document.location = '/post_exercise';
     },
     error: function(xhr, status, err) {
       console.log('Did not update!');
       console.error(this.props.url, status, err.toString());
     }.bind(this)
   });
 },

 getInitialState: function(){
   return {
     fltr: null
   };
 },

 toggle: function (id) {
   console.log(id);
   this.setState({
     fltr: id
   })
 },
 reToggle: function (id) {
   this.setState({
     fltr: null
   })
 },

 render: function() {

   var that = this;

   var renderUpdateForm = this.props.data.map(function(exercises) {
    
     if(exercises.name == that.state.fltr) {
       return (

         <div key={exercises._id}>
         <div className='col-md-4'>
           <h1>Edit {exercises.name}</h1>
           <form>
             <div key={exercises._id} className=''>
               <div className='form-group'>
                 <label>Exercise Name</label>
                 <textarea rows='1' type='text' ref='name' className='form-control'  defaultValue={exercises.name}/>
               </div>
               <div className='form-group'>
                 <label>Exercise Type</label>
                 <textarea rows='1' type='text' ref='type' className='form-control'  defaultValue={exercises.type}/>
               </div>
               <div className='form-group'>
                 <label>Exercise Problem</label>
                 <textarea rows='10' type='text' className='form-control' ref='problem' defaultValue={exercises.problem}/>
                 </div>
        
               <div className='form-group'>
                 <label>Exercise Answer</label>
                 <textarea rows='10' type='text' ref='answer' className='form-control'  defaultValue={exercises.answer}/>
               </div>
               <div className='form-group'>
                 <button onClick={that.handleUpdate.bind(that, exercises._id)} type='submit' className='btn btn-default'> Submit {exercises.name}</button>
               </div>
             </div>
           </form>
          </div>
       </div>
       )
     }
   }.bind(that));

     var updateExerciseData = this.props.data.map(function(exercises){
       return(
         <div key={exercises._id} className="well">
          <table>
            <tbody>
             <tr>
               <td>{exercises.name}</td>
               <td><button onClick={that.toggle.bind(this, exercises.name)}></button></td>
             </tr>
            </tbody> 
           </table> 
         </div>
       )
     });
   
     return(
        <div className='container'>
          <div className=''>
            {renderUpdateForm}
          </div>
          <div className=" col-md-4">
            <div>
              <h1>{updateExerciseData}</h1>
            </div>
          </div>
        </div>

      )
    }
  });  

module.exports = CrudList;
