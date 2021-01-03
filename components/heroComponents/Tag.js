const Tag = ({ category, year }) => {
  return (
    <div className="border-l border-gray-900 px-3 pt-1 mb-10">
      <p className="text-xs tracking-wider m-0 leading-tight">{category}</p>
      { year && <p className="text-xs tracking-wider m-0 leading-tight">{year}</p>}
    </div>
  )
}

export default Tag