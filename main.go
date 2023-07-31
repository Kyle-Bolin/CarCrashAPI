package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
	// "errors"
)

type crash struct {
	ID string `json:"id"`
}

var crashes = []crash{
	{ID: "1"}, {ID: "2"},
}

func getCrashes(c *gin.Context) {
	c.IndentedJSON(http.StatusOK, crashes)
}
func main() {
	router := gin.Default()
	router.GET("/crashes", getCrashes)
	router.Run("localhost:8080")

}
