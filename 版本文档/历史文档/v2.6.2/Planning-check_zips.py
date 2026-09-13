import urllib.request
import re

try:
    html = urllib.request.urlopen('https://mist01.com/live2d/').read().decode('utf-8')
    zips = re.findall(r'href=[\'"](.*?\.zip)', html)
    print("Found zips:")
    for z in zips:
        print(z)
except Exception as e:
    print("Error:", e)
