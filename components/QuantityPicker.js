import React from 'react'

export default function QuantityPicker({
  increment, decrement, numberOfitems, hideQuantityLabel
}) {
  return (
    <div className={`flex items-center`}>
      {
        !hideQuantityLabel && (
          <div className="px-2 text-xs">QUANTITY</div>
        )
      }
      <button
        className="
        w-10 h-10 text-xl
        md:w-8 md:h-8 md:text-sm 
        cursor-pointer text-center border pb-.5
        hover:bg-gray-900 hover:text-white
        focus:outline-none
        "
        onClick={increment}
      >+</button>
      <p className="
        w-10 h-10 pt-2 text-base
        md:w-8 md:h-8 md:pt-2 md:text-xs
        m-0 border-t border-b text-center">{numberOfitems}</p>
      <button
        className="
        w-10 h-10 text-2xl
        md:w-8 md:h-8 md:text-sm
        cursor-pointer text-center border pb-.5
        hover:bg-gray-900 hover:text-white
        focus:outline-none
        "
        onClick={decrement}>-</button>
    </div>
  )
}