import Image from 'next/image'


const ImageComponent = ({ src, ...props}) => {
  return <img src={src} {...props} />
}

export default ImageComponent
