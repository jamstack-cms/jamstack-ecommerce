import React from 'react'
import AddInventory from '../components/formComponents/AddInventory'
import ViewInventory from '../components/ViewInventory'

class Inventory extends React.Component {
  state = {
    viewState: 'view'
  }
  toggleViewState(viewState) {
    this.setState(() => ({ viewState }))
  }
  render() {
     return (
       <div>
          <h3>Inventory</h3>
          <div className="flex">
            <p role="button" className="mr-4 cursor-pointer hover:text-primary" onClick={() => this.toggleViewState('view')}>View</p>
            <p role="button" className="cursor-pointer hover:text-primary" onClick={() => this.toggleViewState('add')}>Add</p>
          </div>
          {
            this.state.viewState === 'view' ? (
              <ViewInventory />
            ) : (<AddInventory />)
          }
          <button onClick={this.props.signOut} className="bg-primary hover:bg-black text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" type="button">
            Sign Out
          </button>
       </div>
     )
  }
}

export default Inventory