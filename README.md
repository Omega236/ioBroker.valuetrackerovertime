![Logo](admin/ValueTrackerOverTime_Logo.png)
# ioBroker.valuetrackerovertime

[![NPM version](http://img.shields.io/npm/v/iobroker.valuetrackerovertime.svg)](https://www.npmjs.com/package/iobroker.valuetrackerovertime)
[![Downloads](https://img.shields.io/npm/dm/iobroker.valuetrackerovertime.svg)](https://www.npmjs.com/package/iobroker.valuetrackerovertime)
![Number of Installations (latest)](http://iobroker.live/badges/valuetrackerovertime-installed.svg)
![Number of Installations (stable)](http://iobroker.live/badges/valuetrackerovertime-stable.svg)
[![Dependency Status](https://img.shields.io/david/Omega236/iobroker.valuetrackerovertime.svg)](https://david-dm.org/Omega236/iobroker.valuetrackerovertime)
[![Known Vulnerabilities](https://snyk.io/test/github/Omega236/ioBroker.valuetrackerovertime/badge.svg)](https://snyk.io/test/github/Omega236/ioBroker.valuetrackerovertime)

[![NPM](https://nodei.co/npm/iobroker.valuetrackerovertime.png?downloads=true)](https://nodei.co/npm/iobroker.valuetrackerovertime/)

**Tests:** [![Travis-CI](http://img.shields.io/travis/Omega236/ioBroker.valuetrackerovertime/master.svg)](https://travis-ci.org/Omega236/ioBroker.valuetrackerovertime)

## valuetrackerovertime adapter for ioBroker
Tracks all numbers and their increase/decrease. The data then will be used to build statistics on the rate of change, displayed in times such as hours, days, weeks, months, quarters and years. The collected data can be used to visualize i.e. the power consumption in charts.

## Settings
Settings for the ValueTrackerOverTime will be done in two places. The default settings will be handled in the instance of the adapter itself, the settings for the individual datapoints will be done in the datapoints containing the data to be tracked.

### Default settings
[!Image](admin/DefaultSettings.png)




### Datapoint settings

## Changelog

### 0.0.1
* (Omega236) initial release

## License
MIT License

Copyright (c) 2020 Omega236 <general.of.omega@googlemail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
