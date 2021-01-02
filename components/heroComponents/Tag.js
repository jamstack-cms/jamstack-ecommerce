const Tag = ({ category, year }) => {
  return (
    <div className="border-l border-gray-900 px-3 mb-10">
      <p className="text-xxs font-semibold tracking-tight m-0 leading-tight">{category}</p>
      { year && <p className="text-xxs font-semibold tracking-tight m-0 leading-tight">{year}</p>}
    </div>
  )
}

export default Tag