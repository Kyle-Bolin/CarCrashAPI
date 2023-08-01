create table crashes(
"ID" varchar,
"Source" varchar,
Severity integer,
Start_Time timestamp,
End_Time timestamp,
Start_Lat double precision,
Start_Lng double precision,
End_Lat double precision,
End_Lng double precision,
Distance double precision,
Description varchar,
Street varchar,
City varchar,
County varchar,
"State" varchar,
Zipcode varchar,
Country varchar,
Timezone varchar,
Airport_Code varchar,
Weather_Timestamp timestamp,
Temperature double precision,
Wind_Chill double precision,
Humidity double precision,
Pressure double precision,
Visibility double precision,
Wind_Direction varchar,
Wind_Speed double precision,
Precipitation double precision,
Weather_Condition varchar,
Amenity boolean,
Bump boolean,
Crossing boolean,
Give_Way boolean,
Junction boolean,
No_Exit boolean,
Railway boolean,
Roundabout boolean,
Station boolean,
Stop boolean,
Traffic_Calming boolean,
Traffic_Signal boolean,
Turning_Loop boolean,
Sunrise_Sunset varchar,
Civil_Twilight varchar,
Nautical_Twilight varchar,
Astronomical_Twilight varchar
);