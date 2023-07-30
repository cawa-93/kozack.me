const ShortIconLink = ({ className, label, icon, url }) => {
  return (
      <a
          className={className}
          href={url}
          aria-label={label}
          title={label}
          dangerouslySetInnerHTML={{__html: icon.svg}}
      >
      </a>
  );
};

const ExpandedIconLink = ({ className, label, icon, url }) => {
  return (
      <a
          className={className}
          href={url}
          dangerouslySetInnerHTML={{__html: icon.svg + ' ' + label}}
      >
      </a>
  );
};



export default ({ className, label, icon, url, expanded = false }) => {
  return expanded
      ? <ExpandedIconLink className={className} label={label} icon={icon} url={url}/>
      : <ShortIconLink className={className} label={label} icon={icon} url={url}/>
};
