const Footer = ({ designer }) => {
  return (
    <div className="flex flex-1 flex-col justify-end pb-10 mt-4">
        <p className="font-light text-xs tracking-tight m-0 leading-tight mb-2">Design by</p>
        <p className="text-xxs font-semibold tracking-tight m-0 leading-tight">{designer}</p>
    </div>
  )
}

export default Footer