import React from 'react'
import { fetchInventory } from '../utils/inventoryProvider'
import DENOMINATION from '../utils/currencyProvider'
import Image from '../components/Image'
import Link from 'next/link'
import { slugify } from '../utils/helpers'
import { FaTimes } from 'react-icons/fa'

class ViewInventory extends React.Component {
  state = {
    inventory: [],
    currentItem: {},
    editingIndex: []
  }
  componentDidMount() {
    this.fetchInventory()
  }
  fetchInventory = async() => {
    const inventory = await fetchInventory()
    this.setState({ inventory })
  }
  editItem = (item, index) => {
    const editingIndex = index
    this.setState({ editingIndex, currentItem: item })    
  }
  saveItem = async index => {
    const inventory = [...this.state.inventory]
    inventory[index] = this.state.currentItem
    // update item in database
    this.setState({ editingIndex: null, inventory })
  }
  deleteItem = async index => {
    const inventory = [...this.state.inventory.slice(0, index), ...this.state.inventory.slice(index + 1)]
    this.setState({ inventory })
  }
  onChange = event => {
    const currentItem = {
      ...this.state.currentItem,
      [event.target.name]: event.target.value
    }
    
    this.setState({ currentItem })
  }
  render() {
    const { inventory, currentItem, editingIndex } = this.state
    return (
      <div>
        <h2 className="text-3xl">Inventory</h2>
        {
          inventory.map((item, index) => {
            const isEditing = editingIndex === index
            if (isEditing) {
              return (
                <div className="border-b py-10" key={item.id}>
                  <div className="flex items-center">
                    <Link href={`/product/${slugify(item.name)}`}>
                      <a aria-label={item.name}>
                        <Image className="w-32 m-0" src={item.image} alt={item.name} />
                      </a>
                    </Link>
                    <input
                      onChange={(e) => this.onChange(e, index)}
                      className="ml-8 shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                      value={currentItem.name}
                      placeholder="Item name"
                      name="name"
                    />
                    <div className="flex flex-1 justify-end items-center">
                      <p className="m-0 text-sm mr-2">In stock:</p>
                      <input
                        onChange={this.onChange}
                        className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                        value={currentItem.currentInventory}
                        name="currentInventory"
                        placeholder="Item inventory"
                      />
                      <input
                        onChange={this.onChange}
                        className="ml-16 shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                        value={currentItem.price}
                        name="price"
                        placeholder="Item price"
                      />
                    </div>
                    <div role="button" onClick={() => this.saveItem(index)} className="m-0 ml-10 text-gray-900 text-s cursor-pointer">
                      <p className="text-sm ml-10 m-0">Save</p>
                    </div>
                  </div>
                </div>
              )
            }
            return (
              <div className="border-b py-10" key={item.id}>
                <div className="flex items-center">
                  <Link href={`/product/${slugify(item.name)}`}>
                    <a>
                      <Image className="w-32 m-0" src={item.image} alt={item.name} />
                    </a>
                  </Link>
                  <Link href={`/product/${slugify(item.name)}`}>
                    <a>
                      <p className="m-0 pl-10 text-gray-600 text-sm">
                        {item.name}
                      </p>
                    </a>
                  </Link>
                  <div className="flex flex-1 justify-end">
                    <p className="m-0 pl-10 text-gray-900 text-sm">In stock: {item.currentInventory}</p>
                    <p className="m-0 pl-20 text-gray-900 font-semibold">
                      {DENOMINATION + item.price}
                    </p>
                  </div>
                  <div className="flex items-center m-0 ml-10 text-gray-900 text-s cursor-pointer">
                    <FaTimes onClick={() => this.deleteItem(index)} />
                    <p role="button" onClick={() => this.editItem(item, index)} className="text-sm ml-10 m-0">Edit</p>
                  </div>
                </div>
              </div>
            )
          })
        }
      </div>
    )
  }
}

export default ViewInventory