import React, { useState, useEffect } from "react"

async function fetchImage(src, updateSrc) {
  // const image = await S3.getimage(src)
  updateSrc(src)
}

const Image = ({ src, ...props}) => {
  const [imageSrc, updateSrc] = useState(null)
  useEffect(() => {
    fetchImage(src, updateSrc)
  }, [])
  
  return imageSrc ? <img src={imageSrc} {...props} /> : null
}

export default Image
