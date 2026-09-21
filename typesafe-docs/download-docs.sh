mkdir docs
cat docs-urls.txt | while read -r url; do
  # strip https
  url_end=$(echo $url | cut -f 3- -d / | sed 's/\//-/g' | sed 's/-$/.txt/')
  echo $url_end
  curl -sL "$url" |
    htmlq '[id=content]' |
    w3m -dump -T text/html - >"docs/$url_end.txt"
done

(cd docs && cat -- *) >all-docs-compiled.txt
