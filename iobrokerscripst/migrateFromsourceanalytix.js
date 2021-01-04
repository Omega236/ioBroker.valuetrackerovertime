let UrObjectID = 'sonoff.0.Arbeitsplatz.ENERGY_Total'
let Zielname = 'Stromverbrauch_WohnzimmerArbeitsplatz'
let ZielUnit = 'kWh'
let ZielMulti = 1
console.log('Read out Data')
let UrDP = await getObjectAsync(UrObjectID)

// @ts-ignore
let Start_day_SA = UrDP.common.custom['sourceanalytix.0'].start_day / ZielMulti
// @ts-ignore
let Start_week_SA = UrDP.common.custom['sourceanalytix.0'].start_week / ZielMulti
// @ts-ignore
let Start_month_SA = UrDP.common.custom['sourceanalytix.0'].start_month / ZielMulti
// @ts-ignore
let Start_quarter_SA = UrDP.common.custom['sourceanalytix.0'].start_quarter / ZielMulti
// @ts-ignore
let Start_year_SA = UrDP.common.custom['sourceanalytix.0'].start_year / ZielMulti

UrDP.common.custom['valuetrackerovertime.0'] =  {       
        "enabled": true,
        "alias": Zielname,
        "output_unit": ZielUnit,
        "output_multiplier": ZielMulti,
        "detailed_days": true,
        "detailed_weeks": true,
        "detailed_months": true,
        "detailed_quarters": false,
        "detailed_years": true,
        "before_minutes": -1,
        "before_hours": -1,
        "before_days": 7,
        "before_weeks": 4,
        "before_months": 12,
        "before_quarters": -1,
        "before_years": 3,
        "counterResetDetection": true,
        "counterResetDetetion_CountAfterReset": 1
      }
console.log('Aktiviere valuetrackerovertime for ' + UrObjectID)
await setObjectAsync(UrDP._id, UrDP)
let valueTrackerID = "valuetrackerovertime.0." + Zielname 

console.log('valuetrackerovertime aktiviert, warte 10 sek auf erstellen der DP unter  ' + valueTrackerID)
await wait(10000);
await setStateAsync(valueTrackerID + '._startValues.start_01_Day', Start_day_SA, true)
await setStateAsync(valueTrackerID + '._startValues.start_02_Week', Start_week_SA, true)
await setStateAsync(valueTrackerID + '._startValues.start_03_Month', Start_month_SA, true)
await setStateAsync(valueTrackerID + '._startValues.start_04_Quarter', Start_quarter_SA, true)
await setStateAsync(valueTrackerID + '._startValues.start_05_Year', Start_year_SA, true)
let abc = UrDP._id.split('.')

let SA_ID = 'sourceanalytix.0.' + abc.join('__') + '.consumption' 

const TimeFrames = {
    Day: "Day",
    Week: "Week",
    Month: "Month",
    Quarter: "Quarter",
    Year: "Year"
};
let zahler = 0
//SQL für DPs aktivieren
for (let oneTimeFrame in TimeFrames){

    console.log('Übernehme SQL Settings aus den Sourceanalytics-Datenpunkte für ' + oneTimeFrame)
    zahler ++
    let SACurrentID = SA_ID + '.0' + zahler + '_current_' + oneTimeFrame.toLowerCase()
    let NewCurrentID = valueTrackerID + '.0' + zahler + '_current' + oneTimeFrame

    let SACurrentDay = await getObjectAsync(SACurrentID)
    if (existsObject(NewCurrentID)){

        
        let NewCurrentDay = await getObjectAsync(NewCurrentID)
        if (! ('custom' in NewCurrentDay.common))
        {
            NewCurrentDay.common.custom = {}
        }


        if ('sql.0' in SACurrentDay.common.custom)
        {
            NewCurrentDay.common.custom['sql.0'] =  SACurrentDay.common.custom['sql.0']     
        }
        if ('influxdb.0' in SACurrentDay.common.custom)
        {
            NewCurrentDay.common.custom['influxdb.0'] =  SACurrentDay.common.custom['influxdb.0']     
        }
        await setObjectAsync(NewCurrentDay._id, NewCurrentDay)
        console.log(' SQL Settings für ' + NewCurrentDay._id)

    }

}
zahler = 0
console.log('Alle SQL Einstellungen übernommen, warte 10 Sekunden für Ids in Datenbank erstellen')

await wait(20000)

for (let oneTimeFrame in TimeFrames){
    zahler ++
    let SACurrentID = SA_ID + '.0' + zahler + '_current_' + oneTimeFrame.toLowerCase()
    
        
    let NewCurrentID = valueTrackerID + '.0' + zahler + '_current' + oneTimeFrame
    if (existsObject(NewCurrentID) ){

        console.log('Kopiere SQL Daten von Sourceanlytics in neuen DP ' + NewCurrentID)

        console.log(    await getQueryResultAsync(`Insert into iobroker.ts_number
    SELECT  (select id from iobroker.datapoints d2 where name = '${NewCurrentID}') id, t.ts, t.val, t.ack, t._from, t.q 
    FROM iobroker.ts_number t Inner Join iobroker.datapoints d on t.id = d.id  
    where d.name = '${SACurrentID}' ;`) ) ;
        console.log('Daten erfolgreich kopiert nach ' + NewCurrentID)
    }
}


console.log('finished ' +  UrObjectID)

async function getQueryResultAsync(query) {
    return new Promise((resolve, reject) => {
        sendTo('sql.0', 'query', query, function (result) {
            if (!result.error) {
                resolve(result.result);
            } else {
                
                console.error(result.error);
            }
        });
    });
}
