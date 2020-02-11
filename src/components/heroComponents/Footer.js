import React from 'react';

const Footer = ({ designer }) => {
  return (
    <div className="flex flex-1 flex-col justify-end pb-10 mt-4 lg:mt-0">
        <p className="font-light text-gray-600 text-xxs font-semibold tracking-tight m-0 leading-tight mb-2">Design by</p>
        <p className="text-xxs font-semibold tracking-tight m-0 leading-tight">{designer}</p>
    </div>
  )
}

export default Footer