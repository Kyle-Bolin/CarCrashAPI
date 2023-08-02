package main

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type Crash struct {
	Crash_ID              string `gorm:"column:crash_id"`
	Source                string `json:"source"`
	Severity              int    `json:"severity"`
	Start_Time            time.Time
	End_Time              time.Time
	Start_Lat             float64
	Start_Lng             float64
	End_Lat               float64
	End_Lng               float64
	Distance              float64
	Description           string
	Street                string
	City                  string
	County                string
	State_ID              string
	Zipcode               string
	Country               string
	Timezone              string
	Airport_Code          string
	Weather_Timestamp     time.Time
	Temperature           float64
	Wind_Chill            float64
	Humidity              float64
	Pressure              float64
	Visibility            float64
	Wind_Direction        string
	Wind_Speed            float64
	Precipitation         float64
	Weather_Condition     string
	Amenity               bool
	Bump                  bool
	Crossing              bool
	Give_Way              bool
	Junction              bool
	No_Exit               bool
	Railway               bool
	Roundabout            bool
	Station               bool
	Stop                  bool
	Traffic_Calming       bool
	Traffic_Signal        bool
	Turning_Loop          bool
	Sunrise_Sunset        string
	Civil_Twilight        string
	Nautical_Twilight     string
	Astronomical_Twilight string
}

type dbInfo struct {
	db  gorm.DB
	err error
}

var linked_db dbInfo

func getCrachesByCity(city string, state string) (crashes []Crash, err error) {
	results := linked_db.db.Limit(1000).Where("city = ? and state_id = ?", city, state).Find(&crashes)
	err = results.Error
	return crashes, err
}
func CrachesByCity(c *gin.Context) {
	city := c.Param("city")
	state := c.Param("state")
	crashes, err := getCrachesByCity(city, state)
	if err != nil {
		return
	}
	c.IndentedJSON(http.StatusOK, crashes)

}
func getCrachesByID(id string) (crashes []Crash, err error) {
	results := linked_db.db.Where("crash_id = ?", id).Find(&crashes)
	err = results.Error
	return crashes, err
}
func CrachesByID(c *gin.Context) {
	id := c.Param("id")
	crashes, err := getCrachesByID(id)

	if err != nil {
		return
	}
	c.IndentedJSON(http.StatusOK, crashes)
}

func getCrashes(c *gin.Context) {
	var crashes []Crash
	linked_db.db.Limit(5000).Find(&crashes)
	c.IndentedJSON(http.StatusOK, crashes)
}
func connectDB() (db *gorm.DB, err error) {
	dsn := "host=localhost user=postgres password=1234 dbname=CarCrashes port=5433 sslmode=disable TimeZone=EST"
	db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	return db, err
}
func main() {
	db, err := connectDB()
	if err != nil {
		fmt.Println("failed to connect to db")
	} else {
		linked_db.db = *db
		linked_db.err = err

	}
	router := gin.Default()
	router.GET("/crashes", getCrashes)
	router.GET("/crashes/:id", CrachesByID)
	router.GET("/crashesbycity/:city/:state", CrachesByCity)
	router.Run("localhost:8080")

}
