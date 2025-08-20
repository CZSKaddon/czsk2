# Changelog

## 0.5.3

- Improve search for non-EN titles. We now also search for the EN title name.

## 0.5.2

- Fix installation - use correct hostname

## 0.5.1

- Add background to the logo so it renders better on various backgrounds.

## 0.5.0

- Add custom login page that allows the following:
  - Login credentials are verified and if not valid the addon is not installed.
  - Password are salted before storing them in the addon config.
  - Added more WebShare-themed background and custom logo.

## 0.4.1

- Revert: Replace getUrl endpoint with direct call to Webshare.

## 0.4.0

- Use long-term login tokens to make URLs valid for a longer time (#7).
- Replace getUrl endpoint with direct call to Webshare.

## 0.3.5

- Improve search results order (#9).

## 0.3.4

- Show streams matching only by filename (#8).

## 0.3.3

- Fixed issues with 0.3.2
- Set caching limits to prevent caching stream URLs for too long (#7).

## 0.3.2

Fixed and optimized regexes in filenameParser

## 0.3.1

Fix streams not showing up in Web and TizenOS versions of Stremio.

## 0.3.0

Thanks to [@youchi1](https://github.com/youchi1) for these wonderful improvements.

- Show languages extracted from the filename.
- Improve stream metadata - for auto-play of next episodes in series and for better subtitle support.
- Show more relevant streams, sort them better and de-duplicate them.
- Show more results, up to 100.
- Decrease Webshare API use - resolve download URL just for the played stream.

## 0.2.0

Improve search - use localized names and prioritize better matches.

## 0.1.0

The initial version. Contains very basic search and streaming.
