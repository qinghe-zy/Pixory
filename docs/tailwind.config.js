module.exports = {
  content: ['./docs/**/*.html'],
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/container-queries')],
theme: {
extend: {
fontFamily: {
serif: ['"Cormorant Garamond"', '"Noto Serif SC"', 'serif'],
display: ['"Playfair Display"', '"Cormorant Garamond"', 'serif'],
sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
cnserif: ['"Noto Serif SC"', '"Songti SC"', 'serif']
},
colors: {
paper: '#FAF8F5',
paperwarm: '#F4EFEB',
celadonwash: '#EBF4F0',
celadon: '#A8D8CF',
celadondark: '#39665F',
jadedeep: '#234E46',
inkdark: '#172B28',
inkvoid: '#0D1F1C',
champagne: '#D4A840',
champagnelight: '#EAD4A0',
parchment: '#EFECE6'
}
}
}
};